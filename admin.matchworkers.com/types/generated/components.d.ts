import type { Schema, Struct } from '@strapi/strapi';

export interface ContactContacts extends Struct.ComponentSchema {
  collectionName: 'components_contact_contacts';
  info: {
    displayName: 'contacts';
    icon: 'bulletList';
  };
  attributes: {
    designation: Schema.Attribute.String;
    mobile: Schema.Attribute.String;
    name: Schema.Attribute.String;
    remarks: Schema.Attribute.String;
  };
}

export interface ContactSendEmailList extends Struct.ComponentSchema {
  collectionName: 'components_contact_send_email_lists';
  info: {
    displayName: 'SendEmailList';
  };
  attributes: {
    email: Schema.Attribute.Email;
  };
}

export interface ContactShared extends Struct.ComponentSchema {
  collectionName: 'components_contact_shareds';
  info: {
    displayName: 'Shared';
    icon: 'collapse';
  };
  attributes: {
    contactStatus: Schema.Attribute.Enumeration<['Active', 'Inactive']>;
    designation: Schema.Attribute.String;
    email: Schema.Attribute.Email;
    firstName: Schema.Attribute.String;
    lastName: Schema.Attribute.String;
    mobile: Schema.Attribute.String;
    workPhone: Schema.Attribute.String;
  };
}

export interface DocumentsFiles extends Struct.ComponentSchema {
  collectionName: 'components_documents_files';
  info: {
    displayName: 'Files';
    icon: 'apps';
  };
  attributes: {
    file: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    name: Schema.Attribute.String;
    remarks: Schema.Attribute.Text;
  };
}

export interface JobAssignCandidates extends Struct.ComponentSchema {
  collectionName: 'components_job_assign_candidates';
  info: {
    displayName: 'assignCandidates';
    icon: 'user';
  };
  attributes: {
    candidate: Schema.Attribute.Relation<
      'oneToOne',
      'api::candidate.candidate'
    >;
    candidateProcessList: Schema.Attribute.String;
    offerLetter: Schema.Attribute.Media<'images' | 'files'>;
    pipline_chats: Schema.Attribute.Relation<
      'oneToMany',
      'api::pipline-chat.pipline-chat'
    >;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'contact.contacts': ContactContacts;
      'contact.send-email-list': ContactSendEmailList;
      'contact.shared': ContactShared;
      'documents.files': DocumentsFiles;
      'job.assign-candidates': JobAssignCandidates;
    }
  }
}
